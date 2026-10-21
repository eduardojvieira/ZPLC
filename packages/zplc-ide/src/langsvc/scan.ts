/**
 * The declarations of a Structured Text file, read from the tokens of the compiler's lexer (LNG-015, LNG-016).
 *
 * The compiler's parser decides whether a file is valid; this reads the structure of a valid file that the language
 * service needs and the tree does not give reliably: the position of every declared name (a structure's members
 * carry their structure's position in the tree), the type of each as it was written, and the stretches of tokens
 * that are statements, to be resolved against the declarations. Nothing is guessed from text: it is the lexer's
 * tokens, in the order of the compiler's own grammar.
 */

import { TokenType, type Token } from '@zplc/compiler';

export type SymbolKind =
  | 'program'
  | 'function'
  | 'functionBlock'
  | 'interface'
  | 'struct'
  | 'enum'
  | 'alias'
  | 'method'
  | 'global'
  | 'variable'
  | 'input'
  | 'output'
  | 'inout'
  | 'temp'
  | 'external'
  | 'field'
  | 'enumValue';

/** A type as written: the named type it comes down to, and whether it is an array or a reference to one. */
export interface TypeRef {
  /** The innermost named type (`Pair` for `ARRAY[0..3] OF Pair`), or '' when the type has no name. */
  name: string;
  array: boolean;
  pointer: boolean;
}

export interface IndexedParam {
  name: string;
  /** The type as written. */
  type: string;
  direction: 'input' | 'output' | 'inout';
  symbol: number;
}

export interface IndexedSymbol {
  id: number;
  name: string;
  kind: SymbolKind;
  file: string;
  /** Where the name is written, 1-based. */
  line: number;
  column: number;
  /** The program, function, function block, interface, structure, enumeration or method that declares it; -1 at the top. */
  container: number;
  /** For a variable, field or parameter, its type; for a function or a method, its result. */
  type?: TypeRef;
  typeText?: string;
  detail: string;
  /** For a function block: the block it extends, as written. */
  extendsName?: string;
  /** For a function block: the interfaces it implements, as written. */
  implementsNames?: string[];
  /** The whole declaration, from its keyword to the end of its closing keyword (programs, functions, blocks, methods, types). */
  extent?: { line: number; column: number; endLine: number; endColumn: number };
}

/** A stretch of tokens to resolve names in: the statements of a body, or the initial value of a declaration. */
export interface TokenRange {
  from: number;
  to: number;
  /** The program, function, function block or method it is in; -1 for the initial value of a global. */
  scope: number;
  /** For an initial value: the type that its structure initializer names the fields of. */
  initializerType?: TypeRef;
}

/** A name written where a type goes (or after EXTENDS and IMPLEMENTS), to be resolved. */
export interface PendingTypeRef {
  token: number;
  scope: number;
}

export interface FileScan {
  path: string;
  tokens: Token[];
  /** Ids of the symbols the file declares, in source order. */
  symbols: number[];
  ranges: TokenRange[];
  typeRefs: PendingTypeRef[];
}

export interface ScanSink {
  symbols: IndexedSymbol[];
}

const SECTIONS: ReadonlyMap<string, SymbolKind> = new Map([
  [TokenType.VAR, 'variable'],
  [TokenType.VAR_INPUT, 'input'],
  [TokenType.VAR_OUTPUT, 'output'],
  [TokenType.VAR_IN_OUT, 'inout'],
  [TokenType.VAR_TEMP, 'temp'],
  [TokenType.VAR_EXTERNAL, 'external'],
  [TokenType.VAR_GLOBAL, 'global'],
]);
const SECTION_LABEL: Record<string, string> = {
  variable: 'VAR',
  input: 'VAR_INPUT',
  output: 'VAR_OUTPUT',
  inout: 'VAR_IN_OUT',
  temp: 'VAR_TEMP',
  external: 'VAR_EXTERNAL',
  global: 'VAR_GLOBAL',
  field: 'STRUCT',
};
const UNIT_STARTS: ReadonlySet<string> = new Set([
  TokenType.PROGRAM,
  TokenType.FUNCTION,
  TokenType.FUNCTION_BLOCK,
  TokenType.INTERFACE,
  TokenType.TYPE,
]);
const MODIFIERS = new Set(['RETAIN', 'PERSISTENT', 'NON_RETAIN']);
const ELEMENTARY: ReadonlySet<string> = new Set([
  TokenType.BOOL,
  TokenType.TIME,
  TokenType.SINT,
  TokenType.USINT,
  TokenType.INT,
  TokenType.UINT,
  TokenType.DINT,
  TokenType.UDINT,
  TokenType.LINT,
  TokenType.ULINT,
  TokenType.REAL,
  TokenType.LREAL,
  TokenType.STRING,
]);
const ENUM_SEPARATORS: ReadonlySet<string> = new Set([TokenType.LPAREN, TokenType.COMMA]);
const ACCESS_AND_MODIFIERS: ReadonlySet<string> = new Set([
  TokenType.PUBLIC,
  TokenType.PRIVATE,
  TokenType.PROTECTED,
  TokenType.FINAL,
  TokenType.ABSTRACT,
  TokenType.OVERRIDE,
]);

export const sectionOf = (type: string): SymbolKind | undefined => SECTIONS.get(type);

export function sectionLabel(kind: SymbolKind): string {
  return SECTION_LABEL[kind] ?? kind;
}

export function scanFile(path: string, tokens: Token[], sink: ScanSink): FileScan {
  const scan: FileScan = { path, tokens, symbols: [], ranges: [], typeRefs: [] };
  const at = (index: number): Token => tokens[Math.min(index, tokens.length - 1)]!;
  const typeOf = (index: number): string => at(index).type;

  const addSymbol = (token: Token, kind: SymbolKind, container: number, extra: Partial<IndexedSymbol> = {}): IndexedSymbol => {
    const symbol: IndexedSymbol = {
      id: sink.symbols.length,
      name: token.value,
      kind,
      file: path,
      line: token.line,
      column: token.column,
      container,
      detail: sectionLabel(kind),
      ...extra,
    };
    sink.symbols.push(symbol);
    scan.symbols.push(symbol.id);
    return symbol;
  };

  /** Index after the token that closes the bracket opened at `open`. */
  const skipBalanced = (open: number, opening: string, closing: string): number => {
    let depth = 0;
    for (let index = open; index < tokens.length; index++) {
      if (typeOf(index) === opening) depth++;
      else if (typeOf(index) === closing && --depth === 0) return index + 1;
      else if (typeOf(index) === 'EOF') return index;
    }
    return tokens.length;
  };

  /** The extent of the tokens `from` up to, not including, `to`. */
  const extentOf = (from: number, to: number): NonNullable<IndexedSymbol['extent']> => {
    const first = at(from);
    const last = at(Math.max(from, to - 1));
    return { line: first.line, column: first.column, endLine: last.line, endColumn: last.column + last.value.length };
  };

  /** The text of tokens `from` to `to`, spaced the way a declaration is read. */
  const textOf = (from: number, to: number): string => {
    let text = '';
    for (let index = from; index < to; index++) {
      const token = tokens[index]!;
      const glue =
        index === from ||
        ['LBRACKET', 'RBRACKET', 'DOTDOT', 'COMMA', 'RPAREN'].includes(token.type) ||
        ['LBRACKET', 'DOTDOT', 'LPAREN'].includes(typeOf(index - 1));
      text += (glue ? '' : ' ') + (token.type === TokenType.STRING_LITERAL ? `'${token.value}'` : token.value);
    }
    return text;
  };

  /** A type at `index`: the index after it, its text and what it comes down to. */
  const parseType = (index: number, scope: number): { end: number; text: string; ref: TypeRef } => {
    const start = index;
    const first = at(index);
    if (first.type === TokenType.ARRAY) {
      let next = index + 1;
      if (typeOf(next) === TokenType.LBRACKET) next = skipBalanced(next, TokenType.LBRACKET, TokenType.RBRACKET);
      if (typeOf(next) === TokenType.OF) {
        const inner = parseType(next + 1, scope);
        return { end: inner.end, text: textOf(start, inner.end), ref: { name: inner.ref.name, array: true, pointer: inner.ref.pointer } };
      }
      return { end: next, text: textOf(start, next), ref: { name: '', array: true, pointer: false } };
    }
    if (first.type === TokenType.REF_TO || first.type === TokenType.REF) {
      const inner = parseType(index + 1, scope);
      return { end: inner.end, text: textOf(start, inner.end), ref: { name: inner.ref.name, array: inner.ref.array, pointer: true } };
    }
    if (first.type === TokenType.LPAREN) {
      const end = skipBalanced(index, TokenType.LPAREN, TokenType.RPAREN);
      return { end, text: textOf(start, end), ref: { name: '', array: false, pointer: false } };
    }
    if (first.type === TokenType.IDENTIFIER || ELEMENTARY.has(first.type)) {
      let end = index + 1;
      // STRING[80], STRING(80), WSTRING[80]
      if (typeOf(end) === TokenType.LBRACKET) end = skipBalanced(end, TokenType.LBRACKET, TokenType.RBRACKET);
      else if (typeOf(end) === TokenType.LPAREN && typeOf(end + 1) === TokenType.INTEGER)
        end = skipBalanced(end, TokenType.LPAREN, TokenType.RPAREN);
      if (first.type === TokenType.IDENTIFIER) scan.typeRefs.push({ token: index, scope });
      return { end, text: textOf(start, end), ref: { name: first.value, array: false, pointer: false } };
    }
    return { end: index, text: '', ref: { name: '', array: false, pointer: false } };
  };

  /** The index of the `;` (or the closing token) that ends an initial value that starts at `index`, at depth zero. */
  const initializerEnd = (index: number, closers: ReadonlySet<string>): number => {
    let depth = 0;
    for (let cursor = index; cursor < tokens.length; cursor++) {
      const type = typeOf(cursor);
      if (type === TokenType.LPAREN || type === TokenType.LBRACKET || type === TokenType.LCURLY) depth++;
      else if (type === TokenType.RPAREN || type === TokenType.RBRACKET || type === TokenType.RCURLY) depth--;
      else if (depth <= 0 && (type === TokenType.SEMICOLON || closers.has(type) || type === 'EOF')) return cursor;
    }
    return tokens.length;
  };

  /**
   * Declarations from `index` up to a token of `until`: `a, b : T := value;`. Returns the index of that token.
   */
  const scanDeclarations = (index: number, container: number, kind: SymbolKind, until: ReadonlySet<string>): number => {
    let cursor = index;
    while (cursor < tokens.length && !until.has(typeOf(cursor)) && typeOf(cursor) !== 'EOF' && !UNIT_STARTS.has(typeOf(cursor))) {
      if (typeOf(cursor) !== TokenType.IDENTIFIER) {
        cursor++;
        continue;
      }
      const names: Token[] = [at(cursor)];
      cursor++;
      for (;;) {
        if (typeOf(cursor) === TokenType.LCURLY) cursor = skipBalanced(cursor, TokenType.LCURLY, TokenType.RCURLY);
        else if (typeOf(cursor) === TokenType.COMMA && typeOf(cursor + 1) === TokenType.IDENTIFIER) {
          names.push(at(cursor + 1));
          cursor += 2;
        } else if (typeOf(cursor) === TokenType.AT) {
          cursor += typeOf(cursor + 1) === TokenType.IO_ADDRESS ? 2 : 1;
        } else break;
      }
      let type: { end: number; text: string; ref: TypeRef } | undefined;
      let initial: { from: number; to: number } | undefined;
      if (typeOf(cursor) === TokenType.COLON) {
        type = parseType(cursor + 1, container);
        cursor = type.end;
        if (typeOf(cursor) === TokenType.ASSIGN) {
          const to = initializerEnd(cursor + 1, until);
          initial = { from: cursor + 1, to };
          cursor = to;
        }
      }
      if (typeOf(cursor) === TokenType.SEMICOLON) cursor++;
      // a name with no type is not a declaration: in a buffer that is being typed it is a statement
      if (type) {
        for (const name of names) {
          addSymbol(name, kind, container, {
            type: type.ref,
            typeText: type.text,
            detail: `${sectionLabel(kind)}${type.text ? ` ${type.text}` : ''}`,
          });
        }
      }
      if (initial && initial.to > initial.from) {
        scan.ranges.push({ from: initial.from, to: initial.to, scope: container, ...(type ? { initializerType: type.ref } : {}) });
      }
    }
    return cursor;
  };

  const END_VAR = new Set<string>([TokenType.END_VAR]);

  /** A `VAR ... END_VAR` block at `index`; returns the index after it. */
  const scanVarBlock = (index: number, container: number): number => {
    const section = sectionOf(typeOf(index))!;
    let cursor = index + 1;
    while (
      typeOf(cursor) === TokenType.CONSTANT ||
      (typeOf(cursor) === TokenType.IDENTIFIER &&
        MODIFIERS.has(at(cursor).value.toUpperCase()) &&
        typeOf(cursor + 1) !== TokenType.COLON &&
        typeOf(cursor + 1) !== TokenType.COMMA)
    )
      cursor++;
    cursor = scanDeclarations(cursor, container, section, END_VAR);
    return typeOf(cursor) === TokenType.END_VAR ? cursor + 1 : cursor;
  };

  /** The body of a unit: variable blocks, methods, and the statements between them, up to a token of `ends`. */
  const scanBody = (index: number, container: number, ends: ReadonlySet<string>, methods = false): number => {
    let cursor = index;
    let statements = index;
    const flush = (to: number): void => {
      if (to > statements) scan.ranges.push({ from: statements, to, scope: container });
    };
    while (cursor < tokens.length) {
      const type = typeOf(cursor);
      if (ends.has(type)) {
        flush(cursor);
        return cursor + 1;
      }
      if (type === 'EOF' || UNIT_STARTS.has(type)) {
        flush(cursor);
        return cursor;
      }
      if (SECTIONS.has(type)) {
        flush(cursor);
        cursor = scanVarBlock(cursor, container);
        statements = cursor;
        continue;
      }
      if (methods && type === TokenType.METHOD) {
        flush(cursor);
        cursor = scanMethod(cursor, container);
        statements = cursor;
        continue;
      }
      cursor++;
    }
    flush(cursor);
    return cursor;
  };

  const END_METHOD = new Set<string>([TokenType.END_METHOD]);

  const scanMethod = (index: number, owner: number): number => {
    let cursor = index + 1;
    while (
      ACCESS_AND_MODIFIERS.has(typeOf(cursor)) ||
      (typeOf(cursor) === TokenType.IDENTIFIER &&
        at(cursor).value.toUpperCase() === 'INTERNAL' &&
        typeOf(cursor + 1) === TokenType.IDENTIFIER)
    )
      cursor++;
    if (typeOf(cursor) !== TokenType.IDENTIFIER) return scanBody(cursor, owner, END_METHOD);
    const nameToken = at(cursor);
    cursor++;
    let returns: { end: number; text: string; ref: TypeRef } | undefined;
    if (typeOf(cursor) === TokenType.COLON) {
      returns = parseType(cursor + 1, owner);
      cursor = returns.end;
    }
    const method = addSymbol(nameToken, 'method', owner, {
      detail: `METHOD${returns?.text ? ` : ${returns.text}` : ''}`,
      ...(returns ? { type: returns.ref, typeText: returns.text } : {}),
    });
    const end = scanBody(cursor, method.id, END_METHOD);
    method.extent = extentOf(index, end);
    return end;
  };

  const END_PROGRAM = new Set<string>([TokenType.END_PROGRAM]);
  const END_FUNCTION = new Set<string>([TokenType.END_FUNCTION]);
  const END_FB = new Set<string>([TokenType.END_FUNCTION_BLOCK]);
  const END_INTERFACE = new Set<string>([TokenType.END_INTERFACE]);
  const END_STRUCT = new Set<string>([TokenType.END_STRUCT]);

  const scanType = (index: number): number => {
    let cursor = index + 1;
    while (typeOf(cursor) === TokenType.IDENTIFIER && typeOf(cursor + 1) === TokenType.COLON) {
      const nameToken = at(cursor);
      const nameIndex = cursor;
      cursor += 2;
      if (typeOf(cursor) === TokenType.STRUCT) {
        const struct = addSymbol(nameToken, 'struct', -1, { detail: 'STRUCT' });
        cursor = scanDeclarations(cursor + 1, struct.id, 'field', END_STRUCT);
        if (typeOf(cursor) === TokenType.END_STRUCT) cursor++;
        struct.extent = extentOf(nameIndex, cursor);
        if (typeOf(cursor) === TokenType.SEMICOLON) cursor++;
      } else if (typeOf(cursor) === TokenType.LPAREN) {
        const enumeration = addSymbol(nameToken, 'enum', -1, { detail: 'ENUM' });
        const close = skipBalanced(cursor, TokenType.LPAREN, TokenType.RPAREN);
        let depth = 0;
        for (let inner = cursor; inner < close; inner++) {
          const type = typeOf(inner);
          if (type === TokenType.LPAREN) depth++;
          else if (type === TokenType.RPAREN) depth--;
          else if (depth === 1 && type === TokenType.IDENTIFIER && ENUM_SEPARATORS.has(typeOf(inner - 1))) {
            addSymbol(at(inner), 'enumValue', enumeration.id, { detail: `ENUM ${enumeration.name}` });
          }
        }
        cursor = close;
        while (
          cursor < tokens.length &&
          typeOf(cursor) !== TokenType.SEMICOLON &&
          typeOf(cursor) !== TokenType.END_TYPE &&
          typeOf(cursor) !== 'EOF'
        )
          cursor++;
        enumeration.extent = extentOf(nameIndex, cursor);
        if (typeOf(cursor) === TokenType.SEMICOLON) cursor++;
      } else {
        const alias = parseType(cursor, -1);
        const aliasSymbol = addSymbol(nameToken, 'alias', -1, { detail: `TYPE ${alias.text}`, type: alias.ref, typeText: alias.text });
        cursor = alias.end;
        aliasSymbol.extent = extentOf(nameIndex, cursor);
        if (typeOf(cursor) === TokenType.ASSIGN) {
          const to = initializerEnd(cursor + 1, new Set([TokenType.END_TYPE]));
          scan.ranges.push({ from: cursor + 1, to, scope: -1, initializerType: alias.ref });
          cursor = to;
        }
        if (typeOf(cursor) === TokenType.SEMICOLON) cursor++;
      }
    }
    while (cursor < tokens.length && typeOf(cursor) !== TokenType.END_TYPE && typeOf(cursor) !== 'EOF' && !UNIT_STARTS.has(typeOf(cursor)))
      cursor++;
    return typeOf(cursor) === TokenType.END_TYPE ? cursor + 1 : cursor;
  };

  const scanPou = (index: number, kind: 'program' | 'function' | 'functionBlock' | 'interface'): number => {
    let cursor = index + 1;
    while (ACCESS_AND_MODIFIERS.has(typeOf(cursor))) cursor++;
    if (typeOf(cursor) !== TokenType.IDENTIFIER) return cursor;
    const nameToken = at(cursor);
    cursor++;
    const extra: Partial<IndexedSymbol> = {};
    let returns: { end: number; text: string; ref: TypeRef } | undefined;
    if (kind === 'function' && typeOf(cursor) === TokenType.COLON) {
      returns = parseType(cursor + 1, -1);
      cursor = returns.end;
      extra.type = returns.ref;
      extra.typeText = returns.text;
    }
    const names = (from: number, until: (type: string) => boolean): { names: string[]; end: number } => {
      const found: string[] = [];
      let at2 = from;
      while (at2 < tokens.length && until(typeOf(at2))) {
        if (typeOf(at2) === TokenType.IDENTIFIER) {
          found.push(at(at2).value);
          scan.typeRefs.push({ token: at2, scope: -1 });
        }
        at2++;
      }
      return { names: found, end: at2 };
    };
    if (kind === 'functionBlock' || kind === 'interface') {
      if (typeOf(cursor) === TokenType.EXTENDS) {
        const list = names(cursor + 1, (type) => type === TokenType.IDENTIFIER || type === TokenType.COMMA);
        if (list.names[0] !== undefined) extra.extendsName = list.names[0];
        cursor = list.end;
      }
      if (typeOf(cursor) === TokenType.IMPLEMENTS) {
        const list = names(cursor + 1, (type) => type === TokenType.IDENTIFIER || type === TokenType.COMMA);
        extra.implementsNames = list.names;
        cursor = list.end;
      }
    }
    const symbol = addSymbol(nameToken, kind, -1, {
      detail:
        kind === 'function'
          ? `FUNCTION${returns?.text ? ` : ${returns.text}` : ''}`
          : kind === 'program'
            ? 'PROGRAM'
            : kind === 'interface'
              ? 'INTERFACE'
              : 'FUNCTION_BLOCK',
      ...extra,
    });
    const ends = kind === 'program' ? END_PROGRAM : kind === 'function' ? END_FUNCTION : kind === 'interface' ? END_INTERFACE : END_FB;
    const end = scanBody(cursor, symbol.id, ends, kind === 'functionBlock' || kind === 'interface');
    symbol.extent = extentOf(index, end);
    return end;
  };

  let cursor = 0;
  while (cursor < tokens.length) {
    switch (typeOf(cursor)) {
      case TokenType.PROGRAM:
        cursor = scanPou(cursor, 'program');
        break;
      case TokenType.FUNCTION:
        cursor = scanPou(cursor, 'function');
        break;
      case TokenType.FUNCTION_BLOCK:
        cursor = scanPou(cursor, 'functionBlock');
        break;
      case TokenType.INTERFACE:
        cursor = scanPou(cursor, 'interface');
        break;
      case TokenType.TYPE:
        cursor = scanType(cursor);
        break;
      case TokenType.VAR_GLOBAL:
        cursor = scanVarBlock(cursor, -1);
        break;
      default:
        cursor++;
    }
  }
  return scan;
}
