/**
 * What an editor asks of the language service at a position (LNG-015, LNG-016): hover, completion, signature help and
 * the outline of a file, all answered from the project index (`projectIndex.ts`), so they see the declarations of
 * every file of the project and the scope of the position, in a buffer that is being typed as well as in one that
 * parses.
 */

import { getAllFBNames, getAllFnNames, getFB, getFn, tokenizeWithErrors, TokenType, type Token } from '@zplc/compiler';
import type { IndexedSymbol, MemberEntry, ProjectIndex, TypeRef } from './projectIndex';

export type AssistKind = 'variable' | 'function' | 'functionBlock' | 'type' | 'field' | 'method' | 'parameter' | 'enumMember' | 'keyword';

export interface AssistCompletion {
  label: string;
  kind: AssistKind;
  detail: string;
  /** What to insert when it is not the label: a named argument is written `Name := `. */
  insertText?: string;
  /** Where it sorts: 0 what the position is about (members, arguments), 1 what is in scope, 2 the project, 3 the library. */
  rank: number;
}

const KIND_OF_SYMBOL: Partial<Record<IndexedSymbol['kind'], AssistKind>> = {
  program: 'type', function: 'function', functionBlock: 'functionBlock', interface: 'type', struct: 'type', enum: 'type',
  alias: 'type', method: 'method', field: 'field', enumValue: 'enumMember',
  input: 'variable', output: 'variable', inout: 'variable', variable: 'variable', global: 'variable', temp: 'variable', external: 'variable',
};

const ELEMENTARY_TYPES = [
  'BOOL', 'SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL', 'TIME', 'DATE', 'TOD', 'DT',
  'STRING', 'WSTRING', 'BYTE', 'WORD', 'DWORD', 'LWORD',
];

const isWordLike = (token: Token | undefined): boolean => token?.type === TokenType.IDENTIFIER;
const endOf = (token: Token): { line: number; column: number } => ({ line: token.line, column: token.column + token.value.length });

function fileLabel(symbol: IndexedSymbol, here: string): string {
  return symbol.file === here ? `line ${symbol.line}` : `${symbol.file}:${symbol.line}`;
}

export function hoverAt(index: ProjectIndex, file: string, line: number, column: number): { value: string } | null {
  const reference = index.referenceAt(file, line, column);
  if (!reference) return null;
  if (reference.builtin) {
    const { builtin } = reference;
    if (builtin.kind === 'functionBlock') {
      const block = getFB(builtin.name);
      const members = (block?.members ?? []).filter((member) => !member.isInternal && (member.isInput || member.isOutput));
      const list = members.length === 0 ? 'No public members' : members.map((member) => `- ${member.isInput ? 'Input' : 'Output'} \`${member.name}\``).join('\n');
      return { value: `**${builtin.name}** — standard function block\n\n${list}` };
    }
    if (builtin.kind === 'function') {
      const fn = getFn(builtin.name);
      const arguments_ = fn === undefined ? '' : `  \n${fn.variadic ? 'Variadic arguments' : `${fn.argCount} argument${fn.argCount === 1 ? '' : 's'}`}`;
      return { value: `**${builtin.name}** — standard function${arguments_}` };
    }
    return { value: `**${builtin.name}** — member of ${builtin.owner ?? 'a standard block'}` };
  }
  const symbol = index.symbol(reference.symbol);
  if (!symbol) return null;
  const owner = index.symbol(symbol.container);
  const lines = [`**${symbol.name}** — \`${symbol.typeText ?? symbol.detail}\``];
  lines.push(`${symbol.detail}${owner ? ` of ${owner.name}` : ''}`);
  lines.push(`Declared in ${fileLabel(symbol, file)}`);
  return { value: lines.join('  \n') };
}

// ---------------------------------------------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------------------------------------------

const fromMember = (member: MemberEntry): AssistCompletion => {
  if (member.symbol) {
    return { label: member.symbol.name, kind: KIND_OF_SYMBOL[member.symbol.kind] ?? 'variable', detail: member.symbol.detail, rank: 0 };
  }
  return { label: member.name, kind: 'field', detail: member.builtin?.detail ?? member.name, rank: 0 };
};

function fromSymbol(symbol: IndexedSymbol, here: string, rank: number): AssistCompletion {
  return { label: symbol.name, kind: KIND_OF_SYMBOL[symbol.kind] ?? 'variable', detail: `${symbol.detail}${symbol.file === here ? '' : `, ${symbol.file}`}`, rank };
}

/** The tokens of `text` that end at or before the position, and whether the last one is a word that is being typed. */
function prefixTokens(text: string, line: number, column: number): { tokens: Token[]; all: Token[]; typing: boolean } {
  const all = tokenizeWithErrors(text).tokens.filter((token) => token.type !== TokenType.EOF);
  const before = all.filter((token) => {
    const end = endOf(token);
    return end.line < line || (end.line === line && end.column <= column);
  });
  const last = before[before.length - 1];
  // a word the cursor touches is the word being completed, not the context
  const typing = last !== undefined && isWordLike(last) && endOf(last).line === line && endOf(last).column === column;
  return { tokens: typing ? before.slice(0, -1) : before, all, typing };
}

/** The call the position is an argument of: the callee token and the arguments written so far. */
function enclosingCall(tokens: Token[]): { callee: Token; open: number; argument: number; label?: string } | undefined {
  let depth = 0;
  for (let at = tokens.length - 1; at >= 0; at--) {
    const type = tokens[at]!.type;
    if (type === TokenType.RPAREN) depth++;
    else if (type === TokenType.LPAREN) {
      if (depth === 0) {
        const callee = tokens[at - 1];
        if (!callee || callee.type !== TokenType.IDENTIFIER) return undefined;
        let argument = 0;
        let nested = 0;
        let label: string | undefined;
        for (let cursor = at + 1; cursor < tokens.length; cursor++) {
          const inner = tokens[cursor]!.type;
          if (inner === TokenType.LPAREN || inner === TokenType.LBRACKET) nested++;
          else if (inner === TokenType.RPAREN || inner === TokenType.RBRACKET) nested--;
          else if (nested === 0 && inner === TokenType.COMMA) { argument++; label = undefined; }
          else if (nested === 0 && inner === TokenType.IDENTIFIER
            && (tokens[cursor + 1]?.type === TokenType.ASSIGN || tokens[cursor + 1]?.type === TokenType.OUTPUT_ASSIGN)
            && (tokens[cursor - 1]?.type === TokenType.LPAREN || tokens[cursor - 1]?.type === TokenType.COMMA)) label = tokens[cursor]!.value;
        }
        return { callee, open: at, argument, ...(label === undefined ? {} : { label }) };
      }
      depth--;
    }
  }
  return undefined;
}

export function completionsAt(index: ProjectIndex, file: string, line: number, column: number, text: string): AssistCompletion[] {
  const { tokens, all } = prefixTokens(text, line, column);
  const last = tokens[tokens.length - 1];
  const found = new Map<string, AssistCompletion>();
  const add = (completion: AssistCompletion): void => {
    const key = completion.label.toUpperCase();
    if (!found.has(key)) found.set(key, completion);
  };
  const scope = index.scopeAt(file, line, column);
  const sorted = (): AssistCompletion[] => [...found.values()]
    .sort((left, right) => left.rank - right.rank || left.label.toUpperCase().localeCompare(right.label.toUpperCase()) || left.label.localeCompare(right.label));

  // after a dot: the members of the type of what is before it
  if (last?.type === TokenType.DOT) {
    const at = all.indexOf(last);
    const type = index.typeBefore(file, at - 1, scope);
    for (const member of index.membersOfType(type)) add(fromMember(member));
    return sorted();
  }

  // where a type goes
  const typeContext = last?.type === TokenType.COLON || last?.type === TokenType.OF || last?.type === TokenType.REF_TO
    || last?.type === TokenType.EXTENDS || last?.type === TokenType.IMPLEMENTS;
  if (typeContext && last && (last.type === TokenType.EXTENDS || last.type === TokenType.IMPLEMENTS || !insideStatements(index, file, last))) {
    for (const symbol of index.topLevelSymbols()) {
      if (['functionBlock', 'struct', 'enum', 'interface', 'alias'].includes(symbol.kind)) add(fromSymbol(symbol, file, 2));
    }
    for (const name of ELEMENTARY_TYPES) add({ label: name, kind: 'type', detail: 'Elementary type', rank: 3 });
    for (const name of getAllFBNames()) add({ label: name, kind: 'functionBlock', detail: 'Standard function block', rank: 3 });
    return sorted();
  }

  // an argument label of a call: the parameters of the callee, written as `Name := `
  const call = enclosingCall(tokens);
  if (call && (last?.type === TokenType.LPAREN || last?.type === TokenType.COMMA)) {
    const target = index.referenceAt(file, call.callee.line, call.callee.column);
    for (const parameter of parametersOfReference(index, target)) {
      add({ label: parameter.name, kind: 'parameter', detail: parameter.detail, insertText: `${parameter.name} := `, rank: 0 });
    }
  }

  // anything that is in scope here
  for (const symbol of index.localsVisibleFrom(scope)) add(fromSymbol(symbol, file, 1));
  for (const symbol of index.globalSymbols()) add(fromSymbol(symbol, file, 1));
  for (const symbol of index.topLevelSymbols()) if (symbol.kind !== 'program') add(fromSymbol(symbol, file, 2));
  for (const name of getAllFnNames()) add({ label: name, kind: 'function', detail: 'Standard function', rank: 3 });
  for (const name of getAllFBNames()) add({ label: name, kind: 'functionBlock', detail: 'Standard function block', rank: 3 });
  return sorted();
}

const DECLARATION_OPENERS: ReadonlySet<string> = new Set([
  TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT, TokenType.VAR_IN_OUT, TokenType.VAR_TEMP, TokenType.VAR_GLOBAL,
  TokenType.VAR_EXTERNAL, TokenType.STRUCT, TokenType.TYPE, TokenType.FUNCTION, TokenType.METHOD,
]);

/** Whether `token` is in the statements of a body, where a colon is a CASE label and not the one of a declaration. */
function insideStatements(index: ProjectIndex, file: string, token: Token): boolean {
  const tokens = index.tokensOf(file);
  for (let cursor = tokens.findIndex((candidate) => candidate.line === token.line && candidate.column === token.column); cursor >= 0; cursor--) {
    const type = tokens[cursor]!.type;
    if (DECLARATION_OPENERS.has(type)) return false;
    if (type === TokenType.END_VAR || type === TokenType.PROGRAM || type === TokenType.FUNCTION_BLOCK || type === TokenType.END_METHOD) return true;
  }
  return false;
}

function parametersOfReference(index: ProjectIndex, reference: ReturnType<ProjectIndex['referenceAt']>): Array<{ name: string; detail: string }> {
  if (!reference) return [];
  const symbol = index.symbol(reference.symbol);
  if (!symbol) {
    return reference.builtin?.kind === 'functionBlock'
      ? index.membersOfType({ name: reference.builtin.name, array: false, pointer: false }).map((member) => ({ name: member.name, detail: member.builtin?.detail ?? member.name }))
      : [];
  }
  if (symbol.kind === 'function' || symbol.kind === 'method') return index.parametersOf(symbol).map((parameter) => ({ name: parameter.name, detail: parameter.detail }));
  if (symbol.type) {
    const type: TypeRef = { ...symbol.type, array: false };
    return index.membersOfType(type)
      .filter((member) => member.symbol ? ['input', 'output', 'inout'].includes(member.symbol.kind) : member.builtin !== undefined)
      .map((member) => ({ name: member.name, detail: member.symbol?.detail ?? member.builtin?.detail ?? member.name }));
  }
  return [];
}

// ---------------------------------------------------------------------------------------------------------------
// Signature help
// ---------------------------------------------------------------------------------------------------------------

export interface SignatureInfo {
  label: string;
  parameters: Array<{ label: string; detail: string }>;
  activeParameter: number;
}

export function signatureAt(index: ProjectIndex, file: string, line: number, column: number, text: string): SignatureInfo | null {
  const { tokens } = prefixTokens(text, line, column);
  const call = enclosingCall(tokens);
  if (!call) return null;
  const target = index.referenceAt(file, call.callee.line, call.callee.column);
  if (!target) return null;
  const symbol = index.symbol(target.symbol);
  const name = symbol?.name ?? target.builtin?.name ?? call.callee.value;

  let parameters: Array<{ name: string; type: string; direction: string }> = [];
  let result = '';
  if (symbol && (symbol.kind === 'function' || symbol.kind === 'method')) {
    parameters = index.parametersOf(symbol).map((parameter) => ({ name: parameter.name, type: parameter.typeText ?? '', direction: parameter.kind }));
    result = symbol.typeText ? ` : ${symbol.typeText}` : '';
  } else if (symbol?.type) {
    const members = index.membersOfType({ ...symbol.type, array: false });
    parameters = members
      .filter((member) => member.symbol ? ['input', 'output', 'inout'].includes(member.symbol.kind) : member.builtin !== undefined)
      .map((member) => ({ name: member.name, type: member.symbol?.typeText ?? member.type?.name ?? '', direction: member.symbol?.kind ?? (member.builtin?.detail.includes('output') ? 'output' : 'input') }));
  } else if (target.builtin?.kind === 'functionBlock') {
    parameters = index.membersOfType({ name: target.builtin.name, array: false, pointer: false })
      .map((member) => ({ name: member.name, type: member.type?.name ?? '', direction: member.builtin?.detail.includes('output') ? 'output' : 'input' }));
  } else {
    return null;
  }
  if (parameters.length === 0 && !symbol) return null;
  const writes = (parameter: { name: string; type: string; direction: string }): string =>
    `${parameter.name} ${parameter.direction === 'output' ? '=>' : ':'}${parameter.type ? ` ${parameter.type}` : ''}`;
  const labels = parameters.map(writes);
  let active = call.argument;
  if (call.label !== undefined) {
    const named = parameters.findIndex((parameter) => parameter.name.toUpperCase() === call.label!.toUpperCase());
    if (named >= 0) active = named;
  }
  return {
    label: `${name}(${labels.join('; ')})${result}`,
    parameters: labels.map((label, position) => ({ label, detail: parameters[position]!.direction })),
    activeParameter: Math.min(active, Math.max(0, parameters.length - 1)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------------------------------------------

export interface OutlineEntry {
  name: string;
  kind: IndexedSymbol['kind'];
  detail: string;
  /** Where the name is written. */
  line: number;
  column: number;
  /** The whole declaration. */
  range: { line: number; column: number; endLine: number; endColumn: number };
  children: OutlineEntry[];
}

/** The declarations of one file as a tree: a unit holds its variables, parameters and methods, a type its members. */
export function outlineOf(index: ProjectIndex, file: string): OutlineEntry[] {
  const info = index.files.get(file);
  if (!info) return [];
  const entry = (symbol: IndexedSymbol): OutlineEntry => ({
    name: symbol.name, kind: symbol.kind, detail: symbol.detail, line: symbol.line, column: symbol.column,
    range: symbol.extent ?? { line: symbol.line, column: symbol.column, endLine: symbol.line, endColumn: symbol.column + symbol.name.length },
    children: index.membersOfSymbol(symbol.id).filter((member) => member.file === file).map(entry),
  });
  return info.symbols.map((id) => index.symbol(id)!)
    .filter((symbol) => symbol.container < 0 && symbol.kind !== 'global' && symbol.kind !== 'external')
    .map(entry)
    .sort((left, right) => left.line - right.line || left.column - right.column);
}

/** The outline of every file of the project, in the order of the files. */
export function projectOutline(index: ProjectIndex): Array<{ file: string; entries: OutlineEntry[] }> {
  return [...index.files.keys()].map((file) => ({ file, entries: outlineOf(index, file) })).filter((group) => group.entries.length > 0);
}

