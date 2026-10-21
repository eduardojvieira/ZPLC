/**
 * The symbols of a project and what each name in it refers to (LNG-015, LNG-016).
 *
 * Every Structured Text file of the project is scanned (`scan.ts`) and its names are resolved against the declarations
 * in scope: the variables of the program, function, block or method, the members of the block and the blocks it
 * extends, the globals of every file, and the functions, blocks and types of every file. A member written after a dot
 * is resolved by the type of what is before it. The result answers definition, references, rename, hover, completion
 * and signature help without reading text, so a rename of a variable of one program does not touch a variable of the
 * same name in another.
 *
 * A file the parser does not accept (it is being typed) is scanned as far as its tokens go: its declarations are
 * there, so a file that uses them does not lose them while the author is half way through a line, and completion in
 * it has its scope. It is listed in `broken`, and what needs every reference found (rename) refuses while one exists.
 */

import { getFB, getFn, parseWithDiagnostics, tokenizeWithErrors, TokenType, type Token } from '@zplc/compiler';
import { scanFile, type FileScan, type IndexedSymbol, type SymbolKind, type TypeRef } from './scan';

export type { IndexedSymbol, SymbolKind, TypeRef } from './scan';

export interface BuiltinRef {
  kind: 'function' | 'functionBlock' | 'member';
  name: string;
  /** For a member of a standard block: the block. */
  owner?: string;
  detail: string;
}

export interface IndexedReference {
  file: string;
  line: number;
  column: number;
  length: number;
  /** The symbol this names, or -1 when it names none the project declares. */
  symbol: number;
  /** The program, function, block or method the name is written in; -1 outside any. */
  scope: number;
  declaration: boolean;
  /** What the name is in the standard library, when it is. */
  builtin?: BuiltinRef;
  /** The name is a label of an argument, or a field of a structure initializer. */
  label?: boolean;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface FileIndex {
  path: string;
  content: string;
  /** The parser accepted the file; when it did not, what is here is what its tokens declare. */
  ok: boolean;
  symbols: number[];
  references: IndexedReference[];
}

export interface MemberEntry {
  name: string;
  symbol?: IndexedSymbol;
  builtin?: BuiltinRef;
  type?: TypeRef;
}

const upper = (name: string): string => name.toUpperCase();
const TYPE_KINDS: ReadonlySet<SymbolKind> = new Set(['functionBlock', 'struct', 'enum', 'interface', 'alias']);
const VALUE_KINDS: ReadonlySet<SymbolKind> = new Set(['variable', 'input', 'output', 'inout', 'temp', 'external', 'global', 'field']);
const PARAM_KINDS: ReadonlySet<SymbolKind> = new Set(['input', 'output', 'inout']);
/** The longest chain of `EXTENDS` that is followed: a cycle in the project ends here. */
const GUARD = 32;

export class ProjectIndex {
  readonly symbols: IndexedSymbol[] = [];
  readonly files = new Map<string, FileIndex>();
  /** Paths of the files the parser did not accept. */
  readonly broken: string[] = [];
  private readonly members = new Map<number, Map<string, IndexedSymbol[]>>();
  private readonly topLevel = new Map<string, IndexedSymbol[]>();
  private readonly globals = new Map<string, IndexedSymbol[]>();
  private readonly enumValues = new Map<string, IndexedSymbol[]>();
  private readonly scans = new Map<string, FileScan>();
  /** For each file, the type of the value that each identifier token stands for, by the index of the token. */
  private readonly valueTypes = new Map<string, Map<number, TypeRef | undefined>>();

  constructor(files: readonly ProjectFile[]) {
    for (const file of files) {
      const ok = parseWithDiagnostics(file.content).errors.length === 0;
      if (!ok) this.broken.push(file.path);
      const scan = scanFile(file.path, tokenizeWithErrors(file.content).tokens, { symbols: this.symbols });
      this.scans.set(file.path, scan);
      this.files.set(file.path, { path: file.path, content: file.content, ok, symbols: scan.symbols, references: [] });
    }
    for (const symbol of this.symbols) {
      const add = (table: Map<string, IndexedSymbol[]>, key: string): void => {
        const list = table.get(key);
        if (list) list.push(symbol);
        else table.set(key, [symbol]);
      };
      if (symbol.container >= 0) {
        let table = this.members.get(symbol.container);
        if (!table) this.members.set(symbol.container, (table = new Map()));
        add(table, upper(symbol.name));
        if (symbol.kind === 'enumValue') add(this.enumValues, upper(symbol.name));
      } else if (symbol.kind === 'global' || symbol.kind === 'external') {
        add(this.globals, upper(symbol.name));
      } else {
        add(this.topLevel, upper(symbol.name));
      }
    }
    for (const scan of this.scans.values()) this.resolve(scan);
  }

  symbol(id: number): IndexedSymbol | undefined {
    return id >= 0 ? this.symbols[id] : undefined;
  }

  /** The top-level declaration of a type (a block, structure, enumeration, interface or alias) named `name`. */
  typeSymbol(name: string): IndexedSymbol | undefined {
    return this.topLevel.get(upper(name))?.find((symbol) => TYPE_KINDS.has(symbol.kind));
  }

  /** The program, function, block, interface or type declared at the top level named `name`. */
  declaration(name: string): IndexedSymbol | undefined {
    return this.topLevel.get(upper(name))?.[0];
  }

  topLevelSymbols(): IndexedSymbol[] {
    return [...this.topLevel.values()].flat();
  }

  globalSymbols(): IndexedSymbol[] {
    return [...this.globals.values()].flat();
  }

  /** The function block `id` and the blocks it extends, nearest first. */
  blockChain(id: number): IndexedSymbol[] {
    const chain: IndexedSymbol[] = [];
    let current = this.symbol(id);
    while (current && chain.length < GUARD && !chain.includes(current)) {
      chain.push(current);
      const base: IndexedSymbol | undefined = current.extendsName ? this.typeSymbol(current.extendsName) : undefined;
      current = base && (base.kind === 'functionBlock' || base.kind === 'interface') ? base : undefined;
    }
    return chain;
  }

  /** The declarations a name written in `scope` can see, in order of closeness: its own, its block's, then the project's. */
  private scopeChain(scope: number): IndexedSymbol[] {
    const symbol = this.symbol(scope);
    if (!symbol) return [];
    if (symbol.kind === 'method') return [symbol, ...this.blockChain(symbol.container)];
    return symbol.kind === 'functionBlock' ? this.blockChain(symbol.id) : [symbol];
  }

  membersOfSymbol(id: number): IndexedSymbol[] {
    return [...(this.members.get(id)?.values() ?? [])].flat();
  }

  /** The variables, parameters and methods a name written in `scope` can name, without the globals. */
  localsVisibleFrom(scope: number): IndexedSymbol[] {
    const seen = new Set<string>();
    const found: IndexedSymbol[] = [];
    for (const owner of this.scopeChain(scope)) {
      for (const member of this.membersOfSymbol(owner.id)) {
        if (!seen.has(upper(member.name))) {
          seen.add(upper(member.name));
          found.push(member);
        }
      }
    }
    return found;
  }

  /**
   * The members of a type, by what the type is: a block (and its bases), a structure, an enumeration, an interface, an alias, a standard
   * block.
   */
  membersOfType(type: TypeRef | undefined): MemberEntry[] {
    if (!type || type.name === '') return [];
    const declared = this.typeSymbol(type.name);
    const found = new Map<string, MemberEntry>();
    const add = (entry: MemberEntry): void => {
      if (!found.has(upper(entry.name))) found.set(upper(entry.name), entry);
    };
    if (declared) {
      if (declared.kind === 'alias')
        return declared.type && upper(declared.type.name) !== upper(type.name) ? this.membersOfType(declared.type) : [];
      const chain = declared.kind === 'functionBlock' || declared.kind === 'interface' ? this.blockChain(declared.id) : [declared];
      for (const owner of chain) {
        for (const member of this.membersOfSymbol(owner.id))
          add({ name: member.name, symbol: member, ...(member.type ? { type: member.type } : {}) });
      }
      return [...found.values()];
    }
    const block = getFB(type.name);
    if (block) {
      for (const member of block.members) {
        if (member.isInternal || (!member.isInput && !member.isOutput)) continue;
        add({
          name: member.name,
          builtin: {
            kind: 'member',
            name: member.name,
            owner: block.name,
            detail: `${block.name}.${member.name} : ${member.isInput ? 'input' : 'output'}${
              member.dataType ? ` ${typeof member.dataType === 'string' ? member.dataType : 'ARRAY'}` : ''
            }`,
          },
          ...(typeof member.dataType === 'string' ? { type: { name: member.dataType, array: false, pointer: false } } : {}),
        });
      }
    }
    return [...found.values()];
  }

  /** The inputs, outputs and in-outs of something that can be called with named arguments. */
  private callableParams(symbol: IndexedSymbol): MemberEntry[] {
    if (symbol.kind === 'function' || symbol.kind === 'method') {
      return this.membersOfSymbol(symbol.id)
        .filter((member) => PARAM_KINDS.has(member.kind))
        .map((member) => ({ name: member.name, symbol: member, ...(member.type ? { type: member.type } : {}) }));
    }
    return [];
  }

  /** The parameters of a function or method, in declaration order; the inputs, outputs and in-outs of a block. */
  parametersOf(symbol: IndexedSymbol): IndexedSymbol[] {
    const chain = symbol.kind === 'functionBlock' ? this.blockChain(symbol.id).reverse() : [symbol];
    return chain.flatMap((owner) => this.membersOfSymbol(owner.id).filter((member) => PARAM_KINDS.has(member.kind)));
  }

  /** The reference whose name covers the position, if any. */
  referenceAt(file: string, line: number, column: number): IndexedReference | undefined {
    return this.files
      .get(file)
      ?.references.find(
        (reference) => reference.line === line && column >= reference.column && column <= reference.column + reference.length,
      );
  }

  referencesTo(id: number, includeDeclaration = true): IndexedReference[] {
    const found: IndexedReference[] = [];
    for (const file of this.files.values()) {
      for (const reference of file.references) {
        if (reference.symbol === id && (includeDeclaration || !reference.declaration)) found.push(reference);
      }
    }
    return found;
  }

  /** The program, function, block or method whose text holds the position, the innermost. */
  scopeAt(file: string, line: number, column: number): number {
    let best: IndexedSymbol | undefined;
    for (const id of this.files.get(file)?.symbols ?? []) {
      const symbol = this.symbols[id]!;
      const extent = symbol.extent;
      if (!extent || !['program', 'function', 'functionBlock', 'method', 'interface'].includes(symbol.kind)) continue;
      const after = line > extent.line || (line === extent.line && column >= extent.column);
      const before = line < extent.endLine || (line === extent.endLine && column <= extent.endColumn);
      if (
        after &&
        before &&
        (!best ||
          (best.extent && (extent.line > best.extent.line || (extent.line === best.extent.line && extent.column > best.extent.column))))
      )
        best = symbol;
    }
    return best?.id ?? -1;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------------------------------------------

  /** The tokens of a file, as the index read them. */
  tokensOf(file: string): readonly Token[] {
    return this.scans.get(file)?.tokens ?? [];
  }

  /**
   * The type of the value that the expression ending at token `index` of `file` stands for: a name, an element of an
   * array (`Pairs[1]`), what a reference points to (`P^`), or the result of a call. `scope` is where it is written.
   */
  typeBefore(file: string, index: number, scope: number, floor = 0): TypeRef | undefined {
    const tokens = this.scans.get(file)?.tokens;
    const token = tokens?.[index];
    if (!tokens || !token) return undefined;
    if (token.type === TokenType.IDENTIFIER) return this.valueTypes.get(file)?.get(index);
    if (token.type === TokenType.THIS) {
      const owner = this.symbol(scope);
      const block = owner?.kind === 'method' ? this.symbol(owner.container) : owner?.kind === 'functionBlock' ? owner : undefined;
      return block ? { name: block.name, array: false, pointer: false } : undefined;
    }
    if (token.type === TokenType.CARET) {
      const base = this.typeBefore(file, index - 1, scope, floor);
      return base ? { ...base, pointer: false } : undefined;
    }
    if (token.type === TokenType.RBRACKET || token.type === TokenType.RPAREN) {
      const open = token.type === TokenType.RBRACKET ? TokenType.LBRACKET : TokenType.LPAREN;
      let depth = 0;
      for (let at = index; at >= floor; at--) {
        if (tokens[at]!.type === token.type) depth++;
        else if (tokens[at]!.type === open && --depth === 0) {
          const base = this.typeBefore(file, at - 1, scope, floor);
          if (!base) return undefined;
          return token.type === TokenType.RBRACKET ? { ...base, array: false } : base;
        }
      }
    }
    return undefined;
  }

  private lookupVisible(name: string, scope: number): { symbol?: IndexedSymbol; builtin?: BuiltinRef } {
    const key = upper(name);
    for (const owner of this.scopeChain(scope)) {
      const own = owner.kind === 'function' && upper(owner.name) === key ? owner : undefined;
      if (own) return { symbol: own };
      const member = this.members.get(owner.id)?.get(key)?.[0];
      if (member) return { symbol: member };
    }
    const global = this.globals.get(key)?.[0];
    if (global) return { symbol: global };
    const top = this.topLevel.get(key)?.[0];
    if (top) return { symbol: top };
    const value = this.enumValues.get(key)?.[0];
    if (value) return { symbol: value };
    if (getFn(name)) return { builtin: { kind: 'function', name: getFn(name)!.name, detail: `${getFn(name)!.name} : standard function` } };
    if (getFB(name))
      return { builtin: { kind: 'functionBlock', name: getFB(name)!.name, detail: `${getFB(name)!.name} : standard function block` } };
    return {};
  }

  private resolve(scan: FileScan): void {
    const file = this.files.get(scan.path)!;
    const { tokens } = scan;
    const references = file.references;
    const push = (token: Token, symbol: number, scope: number, extra: Partial<IndexedReference> = {}): void => {
      references.push({
        file: scan.path,
        line: token.line,
        column: token.column,
        length: token.value.length,
        symbol,
        scope,
        declaration: false,
        ...extra,
      });
    };
    for (const id of scan.symbols) {
      const symbol = this.symbols[id]!;
      references.push({
        file: scan.path,
        line: symbol.line,
        column: symbol.column,
        length: symbol.name.length,
        symbol: id,
        scope: symbol.container,
        declaration: true,
      });
    }
    for (const pending of scan.typeRefs) {
      const token = tokens[pending.token]!;
      const declared = this.typeSymbol(token.value);
      if (declared) push(token, declared.id, pending.scope);
      else if (getFB(token.value))
        push(token, -1, pending.scope, {
          builtin: {
            kind: 'functionBlock',
            name: getFB(token.value)!.name,
            detail: `${getFB(token.value)!.name} : standard function block`,
          },
        });
      else push(token, -1, pending.scope);
    }

    for (const range of scan.ranges) this.resolveRange(scan, range.from, range.to, range.scope, range.initializerType, push);
  }

  private resolveRange(
    scan: FileScan,
    from: number,
    to: number,
    scope: number,
    initializerType: TypeRef | undefined,
    push: (token: Token, symbol: number, scope: number, extra?: Partial<IndexedReference>) => void,
  ): void {
    const { tokens } = scan;
    let types = this.valueTypes.get(scan.path);
    if (!types) this.valueTypes.set(scan.path, (types = new Map()));
    /** What a token that names a callable or an instance was resolved to, for the `(` that follows it. */
    const named = new Map<number, { symbol?: IndexedSymbol; builtin?: BuiltinRef; type?: TypeRef }>();
    interface Context {
      params?: MemberEntry[];
      struct?: TypeRef;
      call: boolean;
    }
    const stack: Context[] = [];
    let pendingStruct: TypeRef | undefined;
    const typeBefore = (index: number): TypeRef | undefined => this.typeBefore(scan.path, index, scope, from);

    const typeOfSymbol = (symbol: IndexedSymbol): TypeRef | undefined => {
      if (symbol.kind === 'enumValue') {
        const enumeration = this.symbol(symbol.container);
        return enumeration ? { name: enumeration.name, array: false, pointer: false } : undefined;
      }
      // a type named where a value goes (`Color.Red`) is what its members are read from
      if (symbol.kind === 'enum' || symbol.kind === 'struct') return { name: symbol.name, array: false, pointer: false };
      return symbol.type;
    };

    const calleeContext = (index: number): Context => {
      const target = named.get(index);
      if (target?.symbol) {
        const symbol = target.symbol;
        if (symbol.kind === 'function' || symbol.kind === 'method') return { params: this.callableParams(symbol), call: true };
        if (symbol.kind === 'functionBlock') return { call: false };
        if (VALUE_KINDS.has(symbol.kind) && symbol.type)
          return {
            params: this.membersOfType({ ...symbol.type, array: false }).filter((entry) =>
              entry.symbol ? PARAM_KINDS.has(entry.symbol.kind) : entry.builtin !== undefined,
            ),
            call: true,
          };
      }
      // a standard function or block: its arguments are named by the library, which this does not list
      return target?.builtin ? { call: true } : { call: false };
    };

    for (let k = from; k < to; k++) {
      const token = tokens[k]!;
      if (token.type === TokenType.LPAREN) {
        const previous = tokens[k - 1];
        let context: Context = previous?.type === TokenType.IDENTIFIER ? calleeContext(k - 1) : { call: false };
        if (!context.call && pendingStruct) context = { struct: pendingStruct, call: false };
        else if (!context.call && stack.length === 0 && initializerType && k === from) context = { struct: initializerType, call: false };
        pendingStruct = undefined;
        stack.push(context);
        continue;
      }
      if (token.type === TokenType.RPAREN) {
        stack.pop();
        continue;
      }
      if (token.type !== TokenType.IDENTIFIER) continue;

      const previous = tokens[k - 1];
      const next = tokens[k + 1];
      const isLabel =
        (next?.type === TokenType.ASSIGN || next?.type === TokenType.OUTPUT_ASSIGN) &&
        (previous?.type === TokenType.LPAREN || previous?.type === TokenType.COMMA) &&
        stack.length > 0;

      if (previous?.type === TokenType.DOT) {
        const base = typeBefore(k - 2);
        const member = base ? this.membersOfType(base).find((entry) => upper(entry.name) === upper(token.value)) : undefined;
        if (member?.symbol) {
          push(token, member.symbol.id, scope);
          const memberType = typeOfSymbol(member.symbol);
          types.set(k, memberType);
          named.set(k, { symbol: member.symbol, ...(memberType ? { type: memberType } : {}) });
        } else if (member?.builtin) {
          push(token, -1, scope, { builtin: member.builtin });
          types.set(k, member.type);
        } else {
          push(token, -1, scope);
        }
        continue;
      }

      if (isLabel) {
        const context = stack[stack.length - 1]!;
        const found =
          context.params?.find((entry) => upper(entry.name) === upper(token.value)) ??
          (context.struct ? this.membersOfType(context.struct).find((entry) => upper(entry.name) === upper(token.value)) : undefined);
        if (found?.symbol) push(token, found.symbol.id, scope, { label: true });
        else if (found?.builtin) push(token, -1, scope, { label: true, builtin: found.builtin });
        if (next?.type === TokenType.ASSIGN && found?.type && tokens[k + 2]?.type === TokenType.LPAREN) pendingStruct = found.type;
        continue;
      }

      const found = this.lookupVisible(token.value, scope);
      if (found.symbol) {
        push(token, found.symbol.id, scope);
        const type = typeOfSymbol(found.symbol);
        types.set(k, type);
        named.set(k, { symbol: found.symbol, ...(type ? { type } : {}) });
      } else if (found.builtin) {
        push(token, -1, scope, { builtin: found.builtin });
        named.set(k, { builtin: found.builtin });
      } else {
        push(token, -1, scope);
      }
    }
  }
}

export function buildProjectIndex(files: readonly ProjectFile[]): ProjectIndex {
  return new ProjectIndex(files);
}
